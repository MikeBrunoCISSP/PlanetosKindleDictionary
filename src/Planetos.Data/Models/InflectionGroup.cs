namespace Planetos.Data.Models;
public class InflectionGroup {
    public int id { get; set; }
    public string name { get; set; }
    public HashSet<Inflection> inflections { get; set; } = new();
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is InflectionGroup other && equals(other));
    }
    public override int GetHashCode() {
        return id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(name);
    }

    protected bool equals(InflectionGroup other) {
        return id == other.id
               || name.Equals(other.name, StringComparison.InvariantCultureIgnoreCase);
    }
}
