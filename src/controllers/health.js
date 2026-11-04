const healthCheck = (_req, res) => {
  res.status(200).json({
    service: "ibg-auth-iam-api",
    status: "ok",
  });
};

module.exports = { healthCheck };
