using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;

namespace Planetos.Data;
public class PlanetosContext : DbContext {
    public DbSet<Inflection> Inflections { get; set; }
    public DbSet<InflectionGroup> InflectionGroups { get; set; }
    public DbSet<WordDefinition> WordDefinitions { get; set; }
    public DbSet<DictionaryIndex> Indices { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
        optionsBuilder.UseSqlServer("Data Source = (localdb)\\MSSQLLocalDB; Initial Catalog = Planetos;Integrated Security=SSPI");
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        modelBuilder.Entity<WordDefinition>()
            .HasIndex(w => w.Name)
            .IsUnique();
        modelBuilder.Entity<DictionaryIndex>()
            .HasIndex(w => w.Name)
            .IsUnique();
    }
}
