export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: [
        { id: 1, title: '오늘의 일기', content: '좋은 하루였다', date: '2025-09-12' },
        { id: 2, title: '어제의 일기', content: '바쁜 하루였다', date: '2025-09-11' }
      ]
    });
  }
  
  if (req.method === 'POST') {
    const { title, content } = req.body;
    return res.status(201).json({
      success: true,
      data: {
        id: Date.now(),
        title,
        content,
        date: new Date().toISOString().split('T')[0]
      }
    });
  }
  
  res.status(405).json({ error: 'Method not allowed' });
}