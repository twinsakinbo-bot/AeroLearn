const fs = require('fs');
const path = require('path');

const walk = (dir, done) => {
  let results = [];
  fs.readdir(dir, (err, list) => {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach((file) => {
      file = path.resolve(dir, file);
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          if (file.endsWith('.tsx')) {
            results.push(file);
          }
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

const replacements = [
  { regex: /\bbg-white\b(?!\/)/g, replacement: "bg-surface" },
  { regex: /\bbg-gray-50\b(?!\/)/g, replacement: "bg-surface-hover" }, // Or similar, wait let's just use dark:bg-...
  // Let's use simple string replacements for common bad classes
  { regex: /\bbg-white\b(?!(\/| dark:))/g, replacement: "bg-white dark:bg-gray-900" },
  { regex: /\bbg-gray-50\b(?!(\/| dark:))/g, replacement: "bg-gray-50 dark:bg-gray-800" },
  { regex: /\btext-gray-900\b(?!(\/| dark:))/g, replacement: "text-gray-900 dark:text-white" },
  { regex: /\btext-gray-800\b(?!(\/| dark:))/g, replacement: "text-gray-800 dark:text-gray-200" },
  { regex: /\bborder-gray-100\b(?!(\/| dark:))/g, replacement: "border-gray-100 dark:border-gray-800" },
  { regex: /\bborder-gray-200\b(?!(\/| dark:))/g, replacement: "border-gray-200 dark:border-gray-700" },
];

walk('c:\\yoo\\student-learning-platform\\app\\app', (err, results) => {
  if (err) throw err;
  results.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Some specific fixes for practice/page.tsx etc that uses text-navy
    content = content.replace(/\btext-navy\b(?!(\/| dark:))/g, "text-navy dark:text-white");
    
    // Replace standard colors
    replacements.forEach(r => {
      content = content.replace(r.regex, r.replacement);
    });

    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log('Updated', file);
    }
  });
});
