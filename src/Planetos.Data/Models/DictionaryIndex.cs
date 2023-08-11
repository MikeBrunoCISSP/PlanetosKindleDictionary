namespace Planetos.Data.Models;
public class DictionaryIndex {
    public int Id { get; set; }
    public string Name { get; set; }
    public HashSet<WordDefinition> WordDefinitions { get; set; } = new();
    public int DictionaryId { get; set; }

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
