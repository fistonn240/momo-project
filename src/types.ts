export interface UserProfile {
  uid: string;
  phoneNumber: string;
  displayName: string;
  balance: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  senderId: string | null;
  receiverId: string | null;
  amount: number;
  type: 'transfer' | 'deposit' | 'withdrawal';
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  senderPhone?: string;
  receiverPhone?: string;
  description?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
