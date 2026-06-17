const fs = require('fs');
const Convert = require('ansi-to-html');
const convert = new Convert({ fg: '#FFF', bg: '#000', newline: true, escapeXML: true });

const ansi = fs.readFileSync('output.ans', 'utf8');

// Also replace standard spaces with non-breaking spaces for formatting in HTML
const html = convert.toHtml(ansi).replace(/  /g, '&nbsp; ');

const htmlDocument = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      background: #000;
      color: #FFF;
      font-family: monospace;
      padding: 20px;
      line-height: 1.2;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

fs.writeFileSync('terminal.html', htmlDocument);
