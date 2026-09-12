const fs = require('fs');
let c = fs.readFileSync('src/App.jsx','utf8');
let oldStr = [
  '// 根 cat (parent_cat_id = NULL): 自动展开其 children, 隐藏名字行 (避免与大类名重复)',
  '                                if (c.parent_cat_id === null || c.parent_cat_id === undefined) {',
  '                                  return c.children && c.children.length > 0 ? (',
  '                                    <div key={ci} style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>',
  '                                      {c.children.map((sub, si) => {'
].join('\n');
let newStr = [
  '// 根 cat (parent_cat_id = NULL): 自动展开其 children, 隐藏名字行 (避免与大类名重复)',
  '                                if (c.parent_cat_id === null || c.parent_cat_id === undefined) {',
  '                                  return c.children && c.children.length > 0 ? (',
  '                                    <div key={ci} style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>',
  '                                      <div style={{ padding: "6px 16px", fontSize: 11, color: "yellow" }}>DEBUG: 根 cat {c.name} 有 {c.children.length} 个子</div>',
  '                                      {c.children.map((sub, si) => {'
].join('\n');
if (c.indexOf(oldStr) < 0) { console.log('not found, try simpler'); process.exit(1); }
c = c.replace(oldStr, newStr);
fs.writeFileSync('src/App.jsx', c);
console.log('debug added');