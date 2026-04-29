# Database Schema

## users
- id
- email
- username
- password_hash
- created_at

## energy_systems
- id
- user_id
- name
- raw_json
- is_valid
- validation_report
- created_at

## optimization_runs
- id
- user_id
- system_id
- model_type
- objective
- status
- result_json
- created_at
