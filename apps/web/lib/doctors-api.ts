import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type Doctor = components["schemas"]["DoctorResponseDto"];
export type CreateDoctorDto = components["schemas"]["CreateDoctorDto"];
export type UpdateDoctorDto = components["schemas"]["UpdateDoctorDto"];

export const doctorMasterDataApi = createMasterDataApi<Doctor, CreateDoctorDto, UpdateDoctorDto>("doctors");
