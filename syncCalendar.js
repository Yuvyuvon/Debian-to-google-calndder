import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import express from 'express';
import open from 'open';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid'; // Generate unique ID

dotenv.config();

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const OBSIDIAN_VAULT_PATH = 'C:\\Users\\user\\Documents\\My self\\Calendar';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const app = express();
app.use(express.json());

// Webhook endpoint (Google Calendar will send updates here)
app.post('/webhook', async (req, res) => {
  console.log('🔔 Webhook received:', req.headers);

  if (
    req.headers['x-goog-resource-state'] === 'exists' ||
    req.headers['x-goog-resource-state'] === 'sync'
  ) {
    console.log('📅 Calendar updated, fetching new events...');
    await saveToObsidian();
  }

  res.status(200).send('OK');
});

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  return getNewToken(oAuth2Client);
}

async function fetchEvents(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date().toISOString();

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now,
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items || [];
}

function formatMarkdown(events) {
  let markdownContent = `# 📅 Events for ${new Date().toDateString()}\n\n`;

  events.forEach((event) => {
    const start = event.start.dateTime || event.start.date;
    markdownContent += `## ${event.summary}\n📅 ${start}\n🔗 [Event Link](${event.htmlLink})\n\n`;
  });

  return markdownContent;
}

async function saveToObsidian() {
  const auth = await authorize();
  const events = await fetchEvents(auth);

  if (events.length === 0) {
    console.log('No upcoming events.');
    return;
  }

  // Ensure Calendar folder exists
  if (!fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    fs.mkdirSync(OBSIDIAN_VAULT_PATH, { recursive: true });
  }

  const markdown = formatMarkdown(events);
  const filePath = path.join(
    OBSIDIAN_VAULT_PATH,
    `${new Date().toISOString().split('T')[0]}.md`
  );

  fs.writeFileSync(filePath, markdown, 'utf8');
  console.log(`✅ Google Calendar events synced to ${filePath}`);
}

// **Watch Google Calendar for Real-Time Changes**
async function watchCalendar() {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.watch({
    calendarId: 'primary',
    requestBody: {
      id: uuidv4(), // Generate a unique ID for the webhook
      type: 'web_hook',
      address: 'https://your-public-url.com/webhook', // Change this later
      params: {
        ttl: '86400' // Webhook expires after 24 hours (needs renewal)
      }
    }
  });

  console.log('🔔 Google Calendar Watch Registered:', response.data);
}

// **Start Express Server for Webhooks**
app.listen(3000, () => {
  console.log('🚀 Webhook server listening on port 3000');
});

// **Run Once on Startup**
saveToObsidian().catch(console.error);
watchCalendar().catch(console.error); // Register webhook automatically
