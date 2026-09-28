namespace Government_Service_Navigator.Backend.Services
{
    // HybridCache keys and tags in one place so readers and invalidation cannot drift apart
    public static class CacheKeys
    {
        public const string CatalogTag = "catalog";
        public const string AllServices = "catalog:services:all";
        public static string Service(int id) => $"catalog:service:{id}";

        public static string CitizenTag(string nic) => $"citizen:{nic}";
        public static string CitizenApplications(string nic) => $"citizen:{nic}:applications";

        public static string RevokedToken(string jti) => $"gsn:revoked:{jti}";
    }
}
