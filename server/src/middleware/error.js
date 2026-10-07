export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, _req, res, _next) {
  // Mongo duplicate key (e.g. party name / collector mobile already exists)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ error: `A record with this ${field} already exists` });
  }
  if (err && err.name === 'ValidationError') {
    const msg = Object.values(err.errors).map((e) => e.message).join('; ');
    return res.status(400).json({ error: msg });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  // optimisticConcurrency: another request saved the same record first.
  if (err && err.name === 'VersionError') {
    return res.status(409).json({ error: 'This record was just changed by another request — please try again' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large — if you took a payment photo, please retake it' });
  }
  // httpError(4xx) is an expected, user-facing rejection — no stack trace needed.
  if (!(err && err.expose && err.status < 500)) console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
}

/** Create an error safe to show to the client. */
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}
