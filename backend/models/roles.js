// backend/models/roles.js

// Top-level app roles
export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN', // can promote/demote others
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',             // paired with agentType
  CUSTOMER: 'CUSTOMER',
});

// Subtype for AGENT
export const AGENT_TYPES = Object.freeze({
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
});

// Type guards
export const isValidRole = (role) => Object.values(ROLES).includes(role);
export const isValidAgentType = (t) => Object.values(AGENT_TYPES).includes(t);
