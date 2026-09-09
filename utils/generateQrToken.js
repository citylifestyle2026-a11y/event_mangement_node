const jwt = require("jsonwebtoken");

const generateQrToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1y",
  });
};

module.exports = generateQrToken;