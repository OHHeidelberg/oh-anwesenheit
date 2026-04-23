const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const styles = `
<style>
  body{font-family:sans-serif;background:#f0f2f5;display:flex;flex-direction:column;align-items:center;margin:0;padding:10px 10px 140px 10px}
  .container{width:98%;text-align:center}
  
  .nav-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
  .nav-btn { 
    text-decoration: none; background: #fff; color: #1d1d1f; padding: 10px 18px; 
    border-radius: 20px; font-size: 0.9rem; font-weight: 700; border: 1px solid #ddd;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08); transition: all 0.2s ease;
    display: flex; align-items: center; gap: 6px;
  }
  .nav-btn:hover { background: #f5f5f7; border-color: #bbb; transform: translateY(-1px); }
  
  .btn-krank { color: #d32f2f; background: #fff9f9; border-color: #ffcdd2; }
  .btn-urlaub { color: #007aff; background: #f0f7ff; border-color: #c7e0ff; }
  .btn-server { color: #ed6c02; background: #fffaf0; border-color: #ffe4cc; }
  .btn-docs { color: #555; background: #fafafa; border-color: #ddd; }

  .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:15px;width:100%;justify-content:center}
  .card{background:#fff;padding:15px;border-radius:18px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:200px;margin:0 auto}
  
  .avatar-link { display: inline-block; transition: transform 0.2s; text-decoration: none; }
  .avatar-link:hover { transform: scale(1.05); }
  .avatar{width:75px;height:75px;border-radius:50%;border:4px solid #fff;object-fit:cover;cursor:pointer}
  
  .border-active{border-color:#28a745}
  .border-home{border-color:#ffc107}
  .border-away{border-color:#d1d1d6;filter:grayscale(
