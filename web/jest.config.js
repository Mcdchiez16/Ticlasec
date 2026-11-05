const nextJest = require('next/jest')
module.exports = nextJest({ dir: './' })({
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
})
