import { Module } from "@nestjs/common";
import { CostCenterController } from "./cost-center/cost-center.controller";
import { CostCenterService } from "./cost-center/cost-center.service";
import { ProfitCenterController } from "./profit-center/profit-center.controller";
import { ProfitCenterService } from "./profit-center/profit-center.service";
import { DriverController } from "./driver/driver.controller";
import { DriverService } from "./driver/driver.service";
import { AllocationRuleController } from "./allocation-rule/allocation-rule.controller";
import { AllocationRuleService } from "./allocation-rule/allocation-rule.service";
import { CoaAccountController } from "./coa-account/coa-account.controller";
import { CoaAccountService } from "./coa-account/coa-account.service";
import { DoctorController } from "./doctor/doctor.controller";
import { DoctorService } from "./doctor/doctor.service";
import { ServiceController } from "./service/service.controller";
import { MedicalServiceService } from "./service/service.service";
import { EmployeeController } from "./employee/employee.controller";
import { EmployeeService } from "./employee/employee.service";
import { AssetController } from "./asset/asset.controller";
import { AssetService } from "./asset/asset.service";
import { VendorController } from "./vendor/vendor.controller";
import { VendorService } from "./vendor/vendor.service";
import { BmhpItemController } from "./bmhp-item/bmhp-item.controller";
import { BmhpItemService } from "./bmhp-item/bmhp-item.service";
import { TariffController } from "./tariff/tariff.controller";
import { TariffService } from "./tariff/tariff.service";
import { HospitalSettingsController } from "./hospital-settings/hospital-settings.controller";
import { HospitalSettingsService } from "./hospital-settings/hospital-settings.service";

/**
 * Master Data bounded context (docs/ARCHITECT_AUDIT.md Sprint 3,
 * docs/02_DOMAIN_MODEL.md §1). One module for the whole entity group, same
 * grouping choice as `TenancyModule` for Organization/Hospital/Branch — these
 * entities are small, closely related, and (all but `HospitalSettings`)
 * share the generic CRUD engine (`common/crud/master-data-crud.service.ts`),
 * so a single module keeps the wiring in one place rather than one
 * micro-module per entity.
 */
@Module({
  controllers: [
    CostCenterController,
    ProfitCenterController,
    DriverController,
    AllocationRuleController,
    CoaAccountController,
    DoctorController,
    ServiceController,
    EmployeeController,
    AssetController,
    VendorController,
    BmhpItemController,
    TariffController,
    HospitalSettingsController,
  ],
  providers: [
    CostCenterService,
    ProfitCenterService,
    DriverService,
    AllocationRuleService,
    CoaAccountService,
    DoctorService,
    MedicalServiceService,
    EmployeeService,
    AssetService,
    VendorService,
    BmhpItemService,
    TariffService,
    HospitalSettingsService,
  ],
})
export class MasterDataModule {}
