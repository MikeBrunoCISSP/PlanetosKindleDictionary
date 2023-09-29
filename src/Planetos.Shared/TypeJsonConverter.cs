using System.Text.Json;
using System.Text.Json.Serialization;

namespace Planetos.Shared;
/// <summary>
/// Converts an instance of <see cref="Type"/> type during JSON serialization/deserialization.
/// </summary>
public class TypeJsonConverter : JsonConverter<Type> {
    /// <inheritdoc />
    public override Type Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        String typeName = reader.GetString();
        return String.IsNullOrWhiteSpace(typeName)
            ? null
            : Type.GetType(typeName, false);
    }
    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, Type value, JsonSerializerOptions options) {
        if (value == null) {
            writer.WriteNullValue();

            return;
        }

        String typeName = value.FullName;
        String assemblyName = value.Assembly.FullName;

        writer.WriteStringValue($"{typeName}, {assemblyName}");
    }
}
