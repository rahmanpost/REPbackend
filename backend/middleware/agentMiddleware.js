// 👇 Create this file: backend/middleware/agentMiddleware.js


export const isAgent = (req, res, next) => {
  if (req.user && req.user.role === 'agent') {
    next();
  } else {
    res.status(403).json({ message: 'Agent access only' });
  }
};
