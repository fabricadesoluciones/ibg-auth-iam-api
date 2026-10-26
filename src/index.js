require("dotenv").config();

const cors = require("cors");
const express = require("express");

const app = express();
const port = Number(process.env.PORT || 9002);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requests outside a browser have no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin no permitido por la politica CORS de IAM"));
    },
  })
);
app.use(express.json());

app.use("/api/v1", require("./routes/health"));
app.use("/api/v1/auth", require("./routes/auth"));
app.use("/api/v1/companies", require("./routes/companies"));
app.use("/api/v1/organizationalCatalogs", require("./routes/organizationalCatalogs"));
app.use("/api/v1/roles", require("./routes/roles"));
app.use("/api/v1/user", require("./routes/user"));
app.use("/api/v1/providers", require("./routes/providers"));

app.use((req, res) => {
  res.status(404).json({
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) console.error(error);
  res.status(statusCode).json({
    code: -1,
    message: statusCode >= 500 && !error.statusCode ? "Internal Server Error" : error.message,
    details: error.details || null,
  });
});

app.listen(port, () => {
  console.log(`ibg-auth-iam-api escuchando en el puerto ${port}`);
});
