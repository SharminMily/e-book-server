const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://e-book-21e92.web.app"
    ],
    credentials: true,
  })
);

app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jzgy2jc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// console.log(uri)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollections = client.db("eBook").collection("users");
    const booksCollections = client.db("eBook").collection("books");
    const cartCollections = client.db("eBook").collection("carts");
    const oldBookCollections = client.db("eBook").collection("oldBook");
    const reviewCollections = client.db("eBook").collection("review");
    const paymentCollections = client.db("eBook").collection("payments");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SEC, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares verify
    const verifyToken = (req, res, next) => {
      // console.log("inside verify", req.headers.authorization);

      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SEC, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // admin verify
    // use verify admin after token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user api
    //
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.headers);
      const result = await userCollections.find().toArray();
      res.send(result);
    });

    //
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollections.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      // console.log(req.headers);
      const user = req.body;
      // 1.email unique, 2.upsert,  3. simple
      const query = { email: user.email };
      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    // make admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollections.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // delete
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result);
    });

    // All data
    app.get("/books", async (req, res) => {
      const result = await booksCollections.find().toArray();
      res.send(result);
    });

    // id
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollections.findOne(query);
      res.send(result);
    });

    // cart callection
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollections.insertOne(cartItem);
      res.send(result);
    });

    //
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollections.find(query).toArray();
      res.send(result);
    });

    // delete
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollections.deleteOne(query);
      res.send(result);
    });

    // old book
    app.post("/oldBook", async (req, res) => {
      const cartItem = req.body;
      const result = await oldBookCollections.insertOne(cartItem);
      res.send(result);
    });

    // get
    app.get("/oldBook", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await oldBookCollections.find(query).toArray();
      res.send(result);
    });

    // review
    app.post("/review", async (req, res) => {
      const cartItem = req.body;
      const result = await reviewCollections.insertOne(cartItem);
      res.send(result);
    });

    // get
    // All data
    app.get("/review", async (req, res) => {
      const result = await reviewCollections.find().toArray();
      res.send(result);
    });

    // payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, "amount isn");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ massage: "forbidden access" });
      }
      const result = await paymentCollections.find(query).toArray();
      res.send(result);
    });

    //
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollections.insertOne(payment);
      // carefully delete
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollections.deleteMany(query);

      console.log("payment info", payment);
      res.send(paymentResult, deleteResult);
    });

    // user
    app.get("/user-stats", async (req, res) => {
      const cart = await cartCollections.estimatedDocumentCount();
      const myDonation = await oldBookCollections.estimatedDocumentCount();
      //
      res.send({
        cart,
        myDonation,
      });
    });

    // Admin
    app.get("/admin-stats", async (req, res) => {
      const books = await booksCollections.estimatedDocumentCount();
      const users = await userCollections.estimatedDocumentCount();
      const reviews = await reviewCollections.estimatedDocumentCount();
      const payments = await paymentCollections.estimatedDocumentCount();
      //
      res.send({
       books,
        users,
        reviews,
        payments

      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello E-book!");
});

app.listen(port, () => {
  console.log(`e-book is running on port ${port}`);
});
