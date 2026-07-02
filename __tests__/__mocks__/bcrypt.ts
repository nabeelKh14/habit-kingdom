// Mock bcrypt for test environment — avoids native addon build requirement
const bcrypt = {
  hash: async (data: string, saltOrRounds: string | number) =>
    `$2b$${saltOrRounds}$mockhash_${data}_${Math.random().toString(36).slice(2, 10)}`,
  compare: async (data: string, encrypted: string) =>
    encrypted.includes(data) || encrypted === "mock_compare_true",
  hashSync: (data: string, saltOrRounds: string | number) =>
    `$2b$${saltOrRounds}$mockhash_${data}_${Math.random().toString(36).slice(2, 10)}`,
  compareSync: (data: string, encrypted: string) =>
    encrypted.includes(data) || encrypted === "mock_compare_true",
  genSalt: async (rounds?: number) => `$2b$${rounds || 10}$mocksalt`,
  genSaltSync: (rounds?: number) => `$2b$${rounds || 10}$mocksalt`,
  getRounds: (encrypted: string) => 10,
};

export default bcrypt;
export const { hash, compare, hashSync, compareSync, genSalt, genSaltSync, getRounds } = bcrypt;