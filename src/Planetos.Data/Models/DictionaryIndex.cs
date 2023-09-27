namespace Planetos.Data.Models;
public class KindleIndex {
    public int id { get; set; }
    public string name { get; set; }
    public HashSet<WordDefinition> wordDefinitions { get; set; } = new();
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
