import WS from 'ws';
import { config } from 'dotenv';
import { exec } from 'child_process';
import { hostname } from 'os';
import wrap from 'word-wrap';

config();

interface ServerPayloads {
  IDENTIFY: {
    heartbeatInterval: number;
  };

  HEARTBEAT: {
    timestamp: number;
  };

  IDENTIFIED: {
    sid: string;
    name: string;
  };

  MESSAGE: string;
}

enum ServerCloseCodes {
  OK = 1000,
  ServerError = 4000,
  InvalidToken = 4001,
  InvalidPayload = 4002,
  MissedHeartbeat = 4003,
  AlreadyIdentified = 4004
}

enum ClientCloseCodes {
  OK = 1000,
  ClientError = 4000,
  InvalidPayload = 4001,
  MissedHeartbeat = 4002
}

interface ClientPayloads {
  IDENTITY: {
    token: string;
    name: string;
  };

  HEARTBEAT: {
    timestamp: number;
  };
}

interface GenericPayload {
  op: string;
  d: any;
}

let heartbeatTimeout: NodeJS.Timeout;
let heartbeatInterval: number;

let client: WS,
  errorCount = 0;

function createClient() {
  client = new WS(
    process.env.DEBUG === 'true'
      ? 'ws://localhost:3000/client'
      : 'wss://dumb-alek.alekeagle.com/client'
  );
  client.on('error', err => {
    if (++errorCount > 10) {
      console.error('Too many errors, exiting');
      process.exit(1);
    }
    console.error(err);
    client.terminate();
    client = null;
    setTimeout(createClient, 1000);
  });
  client.on('open', () => {
    if (process.env.DEBUG === 'true') console.log('Connected');
    client.on('message', (data: string) => {
      if (process.env.DEBUG === 'true') console.log(data.toString());
      const payload: GenericPayload = JSON.parse(data.toString());
      if (payload.op === 'IDENTIFY') {
        heartbeatInterval = payload.d.heartbeatInterval;
        client.send(
          JSON.stringify({
            op: 'IDENTITY',
            d: {
              token:
                process.env.DEBUG === 'true'
                  ? process.env.DEBUG_TOKEN
                  : process.env.TOKEN,
              name: hostname()
            }
          })
        );
      } else if (payload.op === 'HEARTBEAT') {
        clearTimeout(heartbeatTimeout);
        client.send(
          JSON.stringify({
            op: 'HEARTBEAT',
            d: {
              timestamp: Date.now()
            }
          })
        );
        heartbeatTimeout = setTimeout(() => {
          client.close(ClientCloseCodes.MissedHeartbeat);
        }, heartbeatInterval);
        if (process.env.DEBUG === 'true') console.log('Heartbeat sent');
      } else if (payload.op === 'IDENTIFIED') {
        client.send(
          JSON.stringify({
            op: 'HEARTBEAT',
            d: {
              timestamp: Date.now()
            }
          })
        );
      } else if (payload.op === 'MESSAGE') {
        const message = JSON.stringify(
          wrap(payload.d, {
            width: 50,
            newline: '\n',
            indent: '',
            trim: true
          })
        );
        console.log('Message received:', message);
        exec(
          `kdialog --title "Hivemind Communication Tunnel" --msgbox ${message}`
        );
      } else {
        console.log('Unknown payload type:', payload.op);
      }
    });
  });

  client.on('close', (code: number) => {
    console.log('Disconnected with code:', code);
    console.log('Attempting to reconnect...');
    setTimeout(createClient, 1000);
  });
}

createClient();
