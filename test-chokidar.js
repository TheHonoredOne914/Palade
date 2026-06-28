import chokidar from 'chokidar';

const watcher = chokidar.watch('.', {
  ignored: [/node_modules/, /\.git/],
  persistent: true,
  ignoreInitial: true,
});

watcher.on('all', (event, path) => {
  console.log(event, path);
});
console.log('Watching...');
setTimeout(() => {
  import('node:fs').then(fs => fs.writeFileSync('test.txt', 'hello'));
}, 1000);
setTimeout(() => {
  process.exit(0);
}, 3000);
