using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;

namespace Planetos.Data;
public class PlanetosContext : DbContext {
    public DbSet<Inflection> inflections { get; set; }
    public DbSet<InflectionGroup> inflectionGroups { get; set; }
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
    }
}
