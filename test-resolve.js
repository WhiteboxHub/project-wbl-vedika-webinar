async function test() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiI0YTc1N2NiZi0wYjJhLTQzODYtOTU5OS04NDZhM2UyYzQwNDgiLCJ0eXBlIjoiaW52aXRlIiwiY3JlYXRlZEF0IjoxNzgwMzQwOTI2NTA5LCJpYXQiOjE3ODAzNDA5MjYsImV4cCI6MTc4MDQyNzMyNn0.sw7fACka1b0trOWEfoujhNT_ILJ8Nz8GK1hxucSoe_w';
  const res = await fetch('http://localhost:3000/join/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
