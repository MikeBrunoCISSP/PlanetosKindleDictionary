namespace Planetos.Data.Models;
public class WordDefinition {
    public int Id { get; set; }
    public string Name { get; set; }
    public string Definition { get; set; }
    public HashSet<InflectionGroup> InflectionGroups { get; set; }
    public int IndexId { get; set; }
    public bool IsApproved { get; set; } = false;

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is WordDefinition other && equals(other));
    }
    public override int GetHashCode() {
        return Id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(Name);
    }

    protected bool equals(WordDefinition other) {
        return Id == other.Id
               || Name.Equals(other.Name, StringComparison.InvariantCultureIgnoreCase);
    }
}
