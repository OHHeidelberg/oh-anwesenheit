const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

// Hilfsfunktion: Emojis übersetzen
function translateEmoji(slackEmoji, isOnline) {
    if (slackEmoji) {
        const emojiMap = {
            ':office:': '🏢', ':house_with_garden:': '🏡', ':house:': '🏠',
            ':palm_tree:': '🌴', ':computer:': '💻', ':car:': '🚗',
            ':oncoming_automobile:': '🚘', ':bus:': '🚌', ':train:': '🚆',
            ':walking:': '🚶', ':coffee:': '☕', ':face_with_thermometer:': '🤒'
        };
        return emojiMap[slackEmoji] || '📍';
    }
    return isOnline ? '🟢' : '⚪';
}

const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 10px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 98%; max-width: 100%; text-align: center; }
      h1 { color: #1d1d1f; margin-bottom: 20px; font-size: 1.8rem; font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); justify-content: center; gap: 15px; width: 100%; }
      .card { background: white; padding: 15px 10px; border-radius: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.03); display: flex; flex-direction: column; align-items: center; max-width: 200px; margin: 0 auto; }
      .avatar { width: 75px; height: 75px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; background: #f8f8f8; border: 4px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); transition: all 0.4s ease; }
      .border-active { border-color: #28a745 !important; filter: grayscale(0); opacity: 1; } 
      .border-home { border-color: #ffc107 !important; filter: grayscale(0); opacity: 1; }
      .border-away { border-color: #d1d1d6 !important; filter: grayscale(100%); opacity: 0.5; }
      .name { font-weight: bold; font-size: 1rem; color: #1d1d1f; display: block; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow:
