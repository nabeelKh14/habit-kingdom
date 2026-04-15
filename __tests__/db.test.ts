import * as SQLite from 'expo-sqlite';
import * as db from '../../lib/db';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => {
  const mockExecuteAsync = jest.fn();
  const mockRunAsync = jest.fn();
  const mockGetAllAsync = jest.fn();
  const mockGetFirstAsync = jest.fn();
  
  return {
    SQLiteDatabase: class {
      execAsync = mockExecuteAsync;
      runAsync = mockRunAsync;
      getAllAsync = mockGetAllAsync;
      getFirstAsync = mockGetFirstAsync;
    },
      openDatabaseAsync: jest.fn().mockResolvedValue({
        execAsync: mockExecuteAsync,
        runAsync: mockRunAsync,
        getAllAsync: mockGetAllAsync,
        getFirstAsync: mockGetFirstAsync,
      }),
    __mockExecuteAsync: mockExecuteAsync,
    __mockRunAsync: mockRunAsync,
    __mockGetAllAsync: mockGetAllAsync,
    __mockGetFirstAsync: mockGetFirstAsync,
  };
});

describe('Database Initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize database without errors', async () => {
    // Mock successful database operations
    (SQLite as any).__mockExecuteAsync.mockResolvedValue(undefined);
    (SQLite as any).__mockRunAsync.mockResolvedValue(undefined);
    
    // This should not throw
    await expect(db.getDatabase()).resolves.toBeDefined();
    
    // Verify that openDatabaseAsync was called
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('kidhabit.db');
  });

  it('should handle database initialization errors', async () => {
    // Mock database error
    const testError = new Error('Database open failed');
    (SQLite.openDatabaseAsync as jest.Mock).mockRejectedValue(testError);
    
    // This should throw the error
    await expect(db.getDatabase()).rejects.toThrow('Database open failed');
  });
});

describe('Table Creation Order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create purchased_skills table before updating it', async () => {
    const mockDb = {
      execAsync: jest.fn(),
      runAsync: jest.fn(),
    } as unknown as SQLite.SQLiteDatabase;
    
    // Mock successful executions
    mockDb.execAsync.mockResValue(undefined);
    mockDb.runAsync.mockResValue(undefined);
    
    // Call initializeTables
    await db.initializeTables(mockDb);
    
    // Get all calls to execAsync
    const execCalls = mockDb.execAsync.mock.calls.map(call => call[0]);
    
    // Find the CREATE TABLE statement for purchased_skills
    const createPurchasedSkillsIndex = execCalls.findIndex(sql => 
      sql.includes('CREATE TABLE IF NOT EXISTS purchased_skills')
    );
    
    // Find the UPDATE statement for purchased_skills
    const updatePurchasedSkillsIndex = execCalls.findIndex(sql => 
      sql.includes('UPDATE purchased_skills SET profileId = \'default\'')
    );
    
    // Verify that CREATE comes before UPDATE
    expect(createPurchasedSkillsIndex).toBeGreaterThanOrEqual(0);
    expect(updatePurchasedSkillsIndex).toBeGreaterThanOrEqual(0);
    expect(updatePurchasedSkillsIndex).toBeGreaterThan(createPurchasedSkillsIndex);
  });
});

describe('Migrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run migrations without throwing on duplicate column errors', async () => {
    const mockDb = {
      execAsync: jest.fn(),
    } as unknown as SQLite.SQLiteDatabase;
    
    // Mock some migrations to throw duplicate column errors
    mockDb.execAsync.mockImplementation(async (query) => {
      if (query.includes('ADD COLUMN') && Math.random() > 0.5) {
        throw { message: 'duplicate column name: profileId' };
      }
      return undefined;
    });
    
    // This should not throw
    await expect(db.initializeTables(mockDb)).resolves.toBeUndefined();
    
    // Verify that execAsync was called for each migration
    expect(mockDb.execAsync).toHaveBeenCalledTimes(14); // 13 original + 1 added for achievements
  });
});