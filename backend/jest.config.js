module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/controllers', '<rootDir>/models', '<rootDir>/test'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleFileExtensions: ['js', 'json', 'jsx', 'node'],
  testPathIgnorePatterns: ['/node_modules/']
};