const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/punctuate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      text: "and then i said hello",
      previousText: "This is a test. "
    })
  });
  const data = await res.text();
  console.log(data);
}
test();
