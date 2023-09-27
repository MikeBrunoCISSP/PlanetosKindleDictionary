namespace Planetos.Data.Models;
public class WordDefinition {
    public int id { get; set; }
    public string name { get; set; }
    public string definition { get; set; }
    public HashSet<InflectionGroup> inflectionGroups { get; set; }
    public int indexId { get; set; }
    public bool isApproved { get; set; } = false;
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is WordDefinition other && equals(other));
    }
    public override int GetHashCode() {
        return id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(name);
    }

    protected bool equals(WordDefinition other) {
        return id == other.id
               || name.Equals(other.name, StringComparison.InvariantCultureIgnoreCase);
    }
}
