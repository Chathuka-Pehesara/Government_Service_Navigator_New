import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OfficerLoginPage from "./officer_login";
import AdminDashboard from "./Admin/admin_dashboard";
import DepartmentAdminDashboard from "./Admin/department_admin_dashboard";
import ManageOfficers from "./Admin/manage_officers";
import OfficerDashboard from "./Officer/officer_dashboard";
import AuditLogs from "./Admin/audit_logs";
import SystemSettings from "./Admin/system_settings";
import AdminInstallmentPlans from "./Admin/admin_installment_plans";
import AdminAnalytics from "./Admin/admin_analytics";
import AdminAnomalyReview from "./Admin/admin_anomaly_review";
import DepartmentManagement from "./Admin/department_management";
import ApplicationCreate from "./Officer/Application_create/application_create";

/*
  Summary: import the necessary components for officer routes
*/
import VerifiedRecords from "./Officer/verified_record";
import PendingReviews from "./Officer/pending_reviews";
import Profile from "./Officer/profile";
import ApplicationsList from "./Officer/applications";
import ApplicationPreview from "./Officer/application_preview";
import VerificationWorkspace from "./Officer/VerificationWorkspace";
import BulkVerification from "./Officer/BulkVerification";
import RejectionCodes from "./Officer/RejectionCodes";
import OfficerAuditLogs from "./Officer/officer_audit_logs";
import ServiceCatalogManager from "./Admin/Service_Catalog/service_catalog_manager";
import EligibilityRuleBuilder from "./Admin/Service_Catalog/eligibility_rule_builder";
import ServiceConfigurationTabs from "./Admin/Service_Catalog/service_configuration_tabs";
import EligibilitySimulator from "./Admin/Service_Catalog/eligibility_simulator";
import FinanceDashboard from "./Finance/finance_dashboard";
import FinanceLedger from "./Finance/finance_ledger";
import FinanceOnlinePayments from "./Finance/finance_online_payments";
import FinanceProfile from "./Finance/finance_profile";
import FinanceRefunds from "./Finance/finance_refunds";
import ManageCollectionSlots from "./Admin/manage_collection_slots";




export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
