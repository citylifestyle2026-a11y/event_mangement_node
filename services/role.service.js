const getRole = () => {
  return {
    role: "Checker",
    permissions: [
      "QR Scanner",
      "Entry Report",
    ],
  };
};

module.exports = {
  getRole,
};