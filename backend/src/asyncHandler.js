// Obalí async route handler tak, aby se odmítnutý Promise předal do
// Express error middlewaru místo nezachycené výjimky.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
