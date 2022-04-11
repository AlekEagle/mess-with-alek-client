import WS from 'ws';
import { config } from 'dotenv';
import { exec } from 'child_process';
import { hostname } from 'os';

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

const client = new WS(
  process.env.DEBUG
    ? 'ws://localhost:3000/client'
    : 'wss://dumb-alek.alekeagle.com/client'
);

client.on('open', () => {
  if (process.env.DEBUG === 'true') console.log('Connected');
  client.on('message', (data: string) => {
    if (process.env.DEBUG === 'true') console.log(data.toString());
    const payload: GenericPayload = JSON.parse(data.toString());
    if (payload.op === 'IDENTIFY') {
      client.send(
        JSON.stringify({
          op: 'IDENTITY',
          d: {
            token: process.env.TOKEN,
            name: hostname()
          }
        })
      );
    } else if (payload.op === 'HEARTBEAT') {
      client.send(
        JSON.stringify({
          op: 'HEARTBEAT',
          d: {
            timestamp: Date.now()
          }
        })
      );
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
      console.log('Message received:', payload.d);
      exec('kdialog --msgbox "' + JSON.stringify(payload.d) + '"');
    } else {
      console.log('Unknown payload type:', payload.op);
    }
  });
});
