# Database Schema Draft

## Core Tables

### organizations
- id
- name
- created_at
- updated_at

### hospitals
- id
- organization_id
- name
- code
- address
- created_at

### branches
- id
- hospital_id
- name
- code

### users
- id
- organization_id
- name
- email
- password_hash
- role_id
- status

### roles
- id
- name
- description

### permissions
- id
- code
- name

### role_permissions
- role_id
- permission_id

## Master Data

### cost_centers
- id
- hospital_id
- code
- name
- type
- status

### profit_centers
- id
- hospital_id
- code
- name
- department
- status

### drivers
- id
- code
- name
- unit
- description

### allocation_rules
- id
- cost_center_id
- driver_id
- method
- priority
- effective_period

### coa_accounts
- id
- code
- name
- category

### doctors
- id
- hospital_id
- code
- name
- specialty
- status

### services
- id
- profit_center_id
- code
- name
- service_type
- standard_duration
- current_tariff

## Transaction Data

### cost_entries
- id
- hospital_id
- period
- cost_center_id
- coa_account_id
- nominal
- source_file_id

### revenue_entries
- id
- hospital_id
- period
- profit_center_id
- service_id
- volume
- revenue
- source_file_id

### driver_values
- id
- hospital_id
- period
- driver_id
- target_center_id
- value

### medical_activities
- id
- hospital_id
- period
- service_id
- doctor_id
- volume
- duration_minutes
- bmhp_cost
- room_cost
- staff_cost
- revenue

## Calculation

### allocation_runs
- id
- hospital_id
- period_id
- method (`direct`|`step_down`)
- status (`draft`|`running`|`completed`|`failed`)
- started_at
- finished_at
- error_message (nullable)
- warnings (nullable JSON array — `{code, cost_center_id, driver_id}[]`, e.g. `W_DRIVER_ZERO`; see `08_COST_ALLOCATION_ENGINE.md` §5)
- supersedes_run_id (nullable, unique — set when this run was created by "recalculate" on an earlier run)
- is_stale, stale_at (nullable — set by an upload rollback for this run's period; see `01_BUSINESS_RULES.md` §5)
- created_by_user_id
- created_at

### allocated_costs
- id
- allocation_run_id
- source_cost_center_id
- target_cost_center_id (nullable — set for a step-down transfer into another cost center)
- target_profit_center_id (nullable — set when the target is a profit center; exactly one of the two target columns is set per row)
- driver_id
- amount
- created_at

### profitability_results
- id
- allocation_run_id
- profit_center_id
- revenue
- direct_cost
- allocated_cost
- total_cost
- gross_profit
- margin

### doctor_profitability_results
- id
- allocation_run_id
- doctor_id
- service_id
- revenue
- cost
- profit
- margin
- avg_duration
- avg_bmhp

## Audit

### audit_logs
- id
- user_id
- action
- entity
- entity_id
- before_json
- after_json
- created_at
