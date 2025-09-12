export default function handler(req, res) {
  res.status(200).json({
    message: 'Hello from diary backend!',
    method: req.method,
    timestamp: new Date().toISOString()
  });
}