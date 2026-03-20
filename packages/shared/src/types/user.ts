export interface UserProfile {
  id: string;
  name: string;
  hederaAccountId: string;
  hbarBalance: number;
  hbarDeposited: number;
  hbarSpent: number;
  createdAt: Date;
  updatedAt: Date;
}
