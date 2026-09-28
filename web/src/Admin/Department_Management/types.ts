export interface Department {
  id: number;
  departmentCode: string;
  name: string;
  category?: string;
  logoUrl?: string;
  contactNumber?: string;
  email?: string;
  website?: string;
  address?: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  officerCount?: number;
  verifyingOfficerCount?: number;
  financeOfficerCount?: number;
  hasRequiredOfficers?: boolean;
}
