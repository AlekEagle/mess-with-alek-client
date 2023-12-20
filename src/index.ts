import WS from 'ws';
import { config } from 'dotenv';
import { spawn } from 'child_process';
import { hostname } from 'os';
import notifier from 'node-notifier';
import SysTray from 'node-systray-v2';
import { readFile } from 'fs/promises';

config();

// duration in milliseconds where we will redisplay the popup if closed too soon
const popupTimeout = 5000;

// Create a new system tray icon.
const tray = new SysTray({
  menu: {
    title: 'Hivemind Communication Tunnel',
    tooltip: 'Hivemind Communication Tunnel',
    items: [
      {
        title: 'Exit',
        tooltip: 'Exit',
        checked: false,
        enabled: true,
      },
    ],
    icon: await readFile('./icon.png', 'base64'),
  },
});

tray.onClick((action) => {
  switch (action.item.title) {
    case 'Exit':
      if (client) client.close(ClientCloseCodes.OK);
      process.exit(0);
    default:
      console.log('Unknown action:', action.item.title);
  }
});

enum ClientCloseCodes {
  OK = 1000,
  ClientError = 4000,
  InvalidPayload = 4001,
  MissedHeartbeat = 4002,
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

function displayPopup(message: string): Promise<void> {
  return new Promise((resolve) => {
    const popup = spawn(
        'kdialog',
        ['--msgbox', message, '--title', 'Hivemind Communication Tunnel'],
        { shell: false },
      ),
      now = Date.now();

    popup.on('close', () => {
      if (Date.now() - now > popupTimeout) {
        resolve();
      } else {
        displayPopup(message).then(resolve);
      }
    });
  });
}

function createClient() {
  client = new WS(
    process.env.DEBUG === 'true'
      ? 'ws://localhost:3000/client'
      : 'wss://dumb-alek.alekeagle.com/client',
  );
  client.on('error', (err) => {
    console.error(err);
    client = null;
    if (++errorCount > 10) {
      console.error('Too many errors, exiting');
      process.exit(1);
    }
    setTimeout(createClient, 1000);
  });
  client.on('open', () => {
    notifier.notify({
      title: 'Hivemind Communication Tunnel',
      message: 'Connected',
    });
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
              name: hostname(),
            },
          }),
        );
      } else if (payload.op === 'HEARTBEAT') {
        clearTimeout(heartbeatTimeout);
        client.send(
          JSON.stringify({
            op: 'HEARTBEAT',
            d: {
              timestamp: Date.now(),
            },
          }),
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
              timestamp: Date.now(),
            },
          }),
        );
      } else if (payload.op === 'MESSAGE') {
        const message = (payload.d as string).trim();
        if (message.length > 0) displayPopup(message);
        else console.log('Empty message lol');
      } else {
        console.log('Unknown payload type:', payload.op);
      }
    });
  });

  client.on('close', (code: number) => {
    notifier.notify({
      title: 'Hivemind Communication Tunnel',
      message: 'Disconnected',
    });
    console.log('Disconnected with code:', code);
    console.log('Attempting to reconnect...');
    if (++errorCount > 10) {
      console.error('Too many errors, exiting');
      notifier.notify({
        title: 'Hivemind Communication Tunnel',
        message: 'Too many errors, exiting',
      });
      process.exit(1);
    }
    setTimeout(createClient, 1000);
  });
}

createClient();
