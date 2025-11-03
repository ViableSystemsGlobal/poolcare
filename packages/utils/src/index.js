function parseBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

const validateJWT = (token) => {
  // TODO: Implement JWT validation
  return true;
};

const hashPassword = async (password) => {
  // TODO: Implement password hashing
  return password;
};

const comparePassword = async (password, hash) => {
  // TODO: Implement password comparison
  return password === hash;
};

module.exports = {
  parseBearerToken,
  validateJWT,
  hashPassword,
  comparePassword,
};
