class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => {
  throw new HttpError(status, message);
};

const sendError = (res, error) => {
  if (!error.status) console.error(error);
  res.status(error.status || 500).json({ message: error.message });
};

module.exports = { HttpError, fail, sendError };
