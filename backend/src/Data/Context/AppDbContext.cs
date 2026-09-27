using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Data.Context
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Officer> Officers { get; set; }
        public DbSet<Admin> Admins { get; set; }
        public DbSet<VerificationTask> VerificationTasks {get; set;}
        public DbSet<OfficerReview> OfficerReviews {get; set;}
        public DbSet<ComplianceCheck> ComplianceChecks {get; set;}
        public DbSet<RejectionReason> RejectionReasons {get; set;}
        public DbSet<AuditLog> AuditLogs {get; set;}
        public DbSet<Template> Templates { get; set; }
        public DbSet<FormField> FormFields { get; set; }
        public DbSet<ServiceProcedure> ServiceProcedures { get; set; }
        public DbSet<EligibilityRule> EligibilityRules { get; set; }
        public DbSet<DocumentRequirement> DocumentRequirements { get; set; }
        public DbSet<FeeSchedule> FeeSchedules { get; set; }
        public DbSet<RevokedToken> RevokedTokens { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<RefundRequest> RefundRequests { get; set; }
        public DbSet<InstallmentPlan> InstallmentPlans { get; set; }
        public DbSet<Installment> Installments { get; set; }
        public DbSet<ServiceUsageStat> ServiceUsageStats { get; set; }
        public DbSet<ReportSnapshot> ReportSnapshots { get; set; }
        public DbSet<AnomalyFlag> AnomalyFlags { get; set; }
        public DbSet<ApplicationSubmission> ApplicationSubmissions { get; set; }
        public DbSet<AgentDraft> AgentDrafts { get; set; }
        public DbSet<SubmissionDocument> SubmissionDocuments { get; set; }
        public DbSet<PaymentReceipt> PaymentReceipts { get; set; }
        public DbSet<CitizenNotification> CitizenNotifications { get; set; }
        public DbSet<Department> Departments { get; set; }
    
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<Department>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.DepartmentCode).IsUnique();
                entity.HasIndex(e => e.Name).IsUnique();
            });

            modelBuilder.Entity<ServiceProcedure>()
                .HasIndex(s => s.ServiceId)
                .IsUnique();
            
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Email).IsUnique();
            });
            modelBuilder.Entity<Officer>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Email).IsUnique();
            });
            modelBuilder.Entity<Admin>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Email).IsUnique();
            });
            // Relationships for Verification and Compliance
            modelBuilder.Entity<OfficerReview>(entity =>
            {
                entity.HasOne(r => r.Task)
                      .WithMany(t => t.Reviews)
                      .HasForeignKey(r => r.TaskId);
            });
            
            modelBuilder.Entity<ComplianceCheck>(entity =>
            {
                entity.HasOne(c => c.Task)
                      .WithMany(t => t.ComplianceChecks)
                      .HasForeignKey(c => c.TaskId);
            });

            modelBuilder.Entity<AgentDraft>()
                .HasIndex(d => d.ApplicationId)
                .IsUnique();

            modelBuilder.Entity<RevokedToken>()
                .HasIndex(t => t.Jti)
                .IsUnique();

            modelBuilder.Entity<RefundRequest>(entity =>
            {
                entity.HasOne(r => r.Payment)
                      .WithMany(p => p.RefundRequests)
                      .HasForeignKey(r => r.PaymentId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InstallmentPlan>(entity =>
            {
                entity.HasOne(ip => ip.Payment)
                      .WithMany()
                      .HasForeignKey(ip => ip.PaymentId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<Installment>(entity =>
            {
                entity.HasOne(i => i.InstallmentPlan)
                      .WithMany(ip => ip.Installments)
                      .HasForeignKey(i => i.InstallmentPlanId)
                      .OnDelete(DeleteBehavior.Cascade);
            });


            modelBuilder.Entity<Template>()
                .HasMany(t => t.Fields)
                .WithOne(f => f.Template)
                .HasForeignKey(f => f.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            // Optional link - deleting a Service Catalog entry unlinks its templates
            // rather than deleting them.
            modelBuilder.Entity<Template>()
                .HasOne(t => t.ServiceProcedure)
                .WithMany()
                .HasForeignKey(t => t.ServiceProcedureId)
                .OnDelete(DeleteBehavior.SetNull);
        }
    }
}
