/**
 * Multi-Tenant Services
 * 
 * Export all multi-tenant services from a single entry point.
 */

export { organizationService } from './organizationService';
export { departmentService } from './departmentService';
export { auditService } from './auditService';

// Re-export types
export type { 
  CreateOrganizationInput, 
  UpdateOrganizationInput, 
  OrganizationWithDetails 
} from './organizationService';

export type { 
  CreateDepartmentInput, 
  UpdateDepartmentInput, 
  DepartmentWithStats 
} from './departmentService';

export type { 
  CreateAuditLogInput, 
  AuditLogFilter 
} from './auditService';
