 ```ts
export const GET = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "TEST ROUTE MATCHES"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
};
```
