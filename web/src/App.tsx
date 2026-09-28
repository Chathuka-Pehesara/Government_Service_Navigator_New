import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Each page is its own chunk, so the browser only downloads the code for the screen it opens
// instead of the whole portal on first load.
const OfficerLoginPage = lazy(() => import("./officer_login"));
const AdminDashboard = lazy(() => import("./Admin/admin_dashboard"));
const DepartmentAdminDashboard = lazy(() => import("./Admin/department_admin_dashboard"));
const ManageOfficers = lazy(() => import("./Admin/manage_officers"));
const OfficerDashboard = lazy(() => import("./Officer/officer_dashboard"));
const AuditLogs = lazy(() => import("./Admin/audit_logs"));
const SystemSettings = lazy(() => import("./Admin/system_settings"));
const AdminInstallmentPlans = lazy(() => import("./Admin/admin_installment_plans"));
const AdminAnalytics = lazy(() => import("./Admin/admin_analytics"));
const AdminAnomalyReview = lazy(() => import("./Admin/admin_anomaly_review"));
const DepartmentManagement = lazy(() => import("./Admin/department_management"));
const ApplicationCreate = lazy(() => import("./Officer/Application_create/application_create"));

/*
  Summary: import the necessary components for officer routes
*/
const VerifiedRecords = lazy(() => import("./Officer/verified_record"));
const PendingReviews = lazy(() => import("./Officer/pending_reviews"));
const Profile = lazy(() => import("./Officer/profile"));
const ApplicationsList = lazy(() => import("./Officer/applications"));
const ApplicationPreview = lazy(() => import("./Officer/application_preview"));
const VerificationWorkspace = lazy(() => import("./Officer/VerificationWorkspace"));
const BulkVerification = lazy(() => import("./Officer/BulkVerification"));
const RejectionCodes = lazy(() => import("./Officer/RejectionCodes"));
const OfficerAuditLogs = lazy(() => import("./Officer/officer_audit_logs"));
const ServiceCatalogManager = lazy(() => import("./Admin/Service_Catalog/service_catalog_manager"));
const EligibilityRuleBuilder = lazy(() => import("./Admin/Service_Catalog/eligibility_rule_builder"));
const ServiceConfigurationTabs = lazy(() => import("./Admin/Service_Catalog/service_configuration_tabs"));
const EligibilitySimulator = lazy(() => import("./Admin/Service_Catalog/eligibility_simulator"));
const FinanceDashboard = lazy(() => import("./Finance/finance_dashboard"));
const FinanceLedger = lazy(() => import("./Finance/finance_ledger"));
const FinanceOnlinePayments = lazy(() => import("./Finance/finance_online_payments"));
const FinanceProfile = lazy(() => import("./Finance/finance_profile"));
const FinanceRefunds = lazy(() => import("./Finance/finance_refunds"));
const ManageCollectionSlots = lazy(() => import("./Admin/manage_collection_slots"));




export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
      <Routes>
        {/* admin routes */}
        <Route path="/" element={<Navigate to="/officer/login" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route
          path="/admin/:deptSlug/dashboard"
          element={<DepartmentAdminDashboard />}
        />
        <Route path="/admin/departments" element={<DepartmentManagement />} />
        <Route path="/admin/manage-officers" element={<ManageOfficers />} />
        <Route path="/officer/dashboard" element={<OfficerDashboard />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
        <Route path="/admin/system-settings" element={<SystemSettings />} />
        <Route path="/admin/installment-plans" element={<AdminInstallmentPlans />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
        <Route path="/admin/anomaly-review" element={<AdminAnomalyReview />} />
        <Route path="/admin/services" element={<ServiceCatalogManager />} />
        <Route path="/admin/collection-slots" element={<ManageCollectionSlots />} />
        <Route
          path="/admin/services/rules"
          element={<EligibilityRuleBuilder />}
        />
        <Route
          path="/admin/services/config"
          element={<ServiceConfigurationTabs />}
        />
        <Route
          path="/admin/services/builder"
          element={<ApplicationCreate />}
        />
        <Route
          path="/officer/builder"
          element={<ApplicationCreate />}
        />

        <Route
          path="/admin/services/simulator"
          element={<EligibilitySimulator />}
        />

        {/* officer route */}
        <Route path="/officer/login" element={<OfficerLoginPage />} />
        <Route path="/officer/applications" element={<ApplicationsList />} />
        <Route path="/officer/verified-records" element={<VerifiedRecords />} />
        <Route path="/officer/pending-reviews" element={<PendingReviews />} />
        <Route path="/officer/profile" element={<Profile />} />
        <Route
          path="/officer/Application_create/application_create"
          element={<ApplicationCreate />}
        />
        <Route
          path="/officer/application-preview"
          element={<ApplicationPreview />}
        />
        <Route path="/officer/verification-workspace/:taskId?" element={<VerificationWorkspace />} />
        <Route path="/officer/bulk-verification" element={<BulkVerification />} />
        <Route path="/officer/rejection-codes" element={<RejectionCodes />} />
        <Route path="/officer/audit-logs" element={<OfficerAuditLogs />} />

        {/* finance officer routes */}
        <Route path="/finance/dashboard" element={<FinanceDashboard />} />
        <Route path="/finance/online-payments" element={<FinanceOnlinePayments />} />
        <Route path="/finance/ledger" element={<FinanceLedger />} />
        <Route path="/finance/refunds" element={<FinanceRefunds />} />
        <Route path="/finance/profile" element={<FinanceProfile />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
