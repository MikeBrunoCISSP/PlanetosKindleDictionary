namespace Planetos.Data.Models;
public class InflectionGroup {
    public int Id { get; set; }
    public string Name { get; set; }
    public HashSet<Inflection> Inflections { get; set; } = new();

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is InflectionGroup other && equals(other));
    }
    public override int GetHashCode() {
        return Id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(Name);
    }

    protected bool equals(InflectionGroup other) {
        return Id == other.Id
               || Name.Equals(other.Name, StringComparison.InvariantCultureIgnoreCase);
    }
}
