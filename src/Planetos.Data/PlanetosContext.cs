using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public class PlanetosContext : DbContext {
    public DbSet<Inflection> inflections { get; set; }
    public DbSet<WordDefinition> wordDefinitions { get; set; }
    public DbSet<KindleIndex> indices { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
        optionsBuilder.UseSqlServer("Data Source = (localdb)\\MSSQLLocalDB; Initial Catalog = Planetos;Integrated Security=SSPI");
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        modelBuilder.Entity<WordDefinition>()
            .HasIndex(w => w.name)
            .IsUnique();
        modelBuilder.Entity<KindleIndex>()
            .HasIndex(w => w.name)
            .IsUnique();

        var indexes = new KindleIndex[] {
            new() { kindleIndexId = IndexId.Characters, name = "Characters", dateCreated = DateTime.UtcNow, lastUpdated = DateTime.UtcNow },
            new() { kindleIndexId = IndexId.Locations, name="Locations", dateCreated = DateTime.UtcNow, lastUpdated = DateTime.UtcNow},
            new() { kindleIndexId = IndexId.Houses, name="Houses", dateCreated = DateTime.UtcNow, lastUpdated = DateTime.UtcNow},
            new() { kindleIndexId = IndexId.Terms, name = "Terms", dateCreated = DateTime.UtcNow, lastUpdated = DateTime.UtcNow}
        };
        modelBuilder.Entity<KindleIndex>().HasData(indexes);
    }
}
