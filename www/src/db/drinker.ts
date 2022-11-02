import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export interface IDrinker {
  key: string;
  remainingCount: number;
  ttl: number;
}

const TTL = 60 * 60 * 24; // 24 hours

export class DrinkerDAO {
  public static TABLE_NAME = process.env.TABLE_NAME_DRINKER || "Drinker";
  private db: DynamoDBDocumentClient;

  constructor(db: DynamoDBDocumentClient) {
    this.db = db;
  }

  public async brew(drinker: Omit<IDrinker, "ttl">): Promise<DrinkerDAO> {
    // Add a -/+ random ttl variance
    const ttlVariance = Math.floor(Math.random() * 60 * 60) - 30 * 60;
    await this.db.send(
      new PutCommand({
        TableName: DrinkerDAO.TABLE_NAME,
        Item: {
          key: drinker.key,
          remainingCount: drinker.remainingCount,
          ttl: Math.floor(Date.now() / 1000) + TTL + ttlVariance,
        },
      })
    );
    return this;
  }

  public async drank(
    drinker: Omit<IDrinker, "ttl" | "remainingCount">
  ): Promise<DrinkerDAO> {
    await this.db.send(
      new UpdateCommand({
        TableName: DrinkerDAO.TABLE_NAME,
        Key: {
          key: drinker.key,
        },
        UpdateExpression: "SET #C = #C - :d",
        ExpressionAttributeNames: {
          "#C": "remainingCount",
        },
        ExpressionAttributeValues: {
          ":d": 1,
        },
      })
    );
    return this;
  }

  public async isAlcoholic(key: string): Promise<Drinker | null> {
    const currentBoard = await this.db.send(
      new GetCommand({
        TableName: DrinkerDAO.TABLE_NAME,
        Key: { key },
      })
    );
    if (!currentBoard.Item) {
      return null;
    }
    return Drinker.fromObject(currentBoard.Item);
  }
}

export class Drinker implements IDrinker {
  public key: string;
  public remainingCount: number;
  public ttl: number;

  constructor(key: string, remainingCount: number, ttl: number) {
    this.key = key;
    this.remainingCount = remainingCount;
    this.ttl = ttl;
  }

  public fromPartial(partial: Partial<IDrinker>): Drinker {
    return Drinker.fromJson({
      ...this.toJson(),
      ...partial,
    });
  }

  public static fromJson(json: any): Drinker {
    return new Drinker(json.key, json.remainingCount, json.ttl);
  }

  public toJson(): IDrinker {
    return {
      key: this.key,
      remainingCount: this.remainingCount,
      ttl: this.ttl,
    };
  }

  public toString(): string {
    return JSON.stringify(this.toJson());
  }

  public equals(other: Drinker): boolean {
    return (
      this.key === other.key &&
      this.ttl === other.ttl &&
      this.remainingCount === other.remainingCount
    );
  }

  public clone(): Drinker {
    return new Drinker(this.key, this.remainingCount, this.ttl);
  }

  public static fromString(str: string): Drinker {
    return Drinker.fromJson(JSON.parse(str));
  }

  public static fromObject(obj: any): Drinker {
    return Drinker.fromJson(obj);
  }
}
