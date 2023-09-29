using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Planetos.Shared;
/// <summary>
/// Converts an instance of <see cref="BigInteger"/> type during JSON serialization/deserialization.
/// </summary>
public class BigIntegerJsonConverter : JsonConverter<BigInteger> {
    public override BigInteger Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.Number) {
            return BigInteger.Zero;
        }

        using var doc = JsonDocument.ParseValue(ref reader);
        return BigInteger.Parse(doc.RootElement.GetRawText(), NumberFormatInfo.InvariantInfo);
    }

    public override void Write(Utf8JsonWriter writer, BigInteger value, JsonSerializerOptions options) {
        writer.WriteRawValue(value.ToString(NumberFormatInfo.InvariantInfo));
    }
}