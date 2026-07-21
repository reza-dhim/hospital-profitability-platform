import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type Employee = components["schemas"]["EmployeeResponseDto"];
export type CreateEmployeeDto = components["schemas"]["CreateEmployeeDto"];
export type UpdateEmployeeDto = components["schemas"]["UpdateEmployeeDto"];

export const employeeMasterDataApi = createMasterDataApi<Employee, CreateEmployeeDto, UpdateEmployeeDto>("employees");
