using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Planetos.Shared;
/// <summary>
/// Converts an instance of <see cref="Double"/> type during JSON serialization/deserialization.
/// </summary>
public class DoubleJsonConverter : JsonConverter<Double> {
    /// <inheritdoc />
    public override Double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.Number) {
            return 0;
        }

        using var doc = JsonDocument.ParseValue(ref reader);
        return Double.Parse(doc.RootElement.GetRawText(), CultureInfo.InvariantCulture);
    }
    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, Double value, JsonSerializerOptions options) {
        writer.WriteRawValue(value == 0
            ? value.ToString("0.0", CultureInfo.InvariantCulture)
            : value.ToString(CultureInfo.InvariantCulture));
    }
}